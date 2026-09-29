"""
Telemetry source abstraction.

The problem statement asks for a system that sits "alongside eRTMAC". This repo has
no eRTMAC connection — it has a simulator (`backend/simulator.py`) that generates a
plausible sensor stream, and nothing that says how a real feed would take its place.
That is the gap this module closes: not by inventing an integration, but by defining
the seam one would plug into, and by failing loudly when a source is asked for that
does not exist.

What is deliberately NOT here
-----------------------------
There is no `ERTMACTelemetrySource` implementation, and no guess at one. Oil India's
eRTMAC interface is not public: the transport is unknown (WITSML 1.4.1.1? 2.0? a
proprietary socket? a REST poll?), as are the record mapping, the authentication
scheme, the update cadence and the units. Writing a client against a guessed
interface would produce code that looks like an integration and cannot connect to
anything — which is worse than an honest gap, because it hides the work still owed.

The stub below therefore raises with the specific information required, so the next
person knows exactly what to ask Oil India for instead of reverse-engineering this
file.
"""

from __future__ import annotations

import os
from typing import Any, Dict, Optional, Protocol, runtime_checkable


@runtime_checkable
class TelemetrySource(Protocol):
    """
    A live drilling-telemetry feed.

    Implementations own the transport; consumers only ever see these calls, so
    swapping the simulator for a rig feed requires no change in the API layer.
    """

    name: str

    def status(self) -> Dict[str, Any]:
        """Current run state, active scenario, well and latest parameters."""

    def set_scenario(self, scenario: str) -> Dict[str, Any]:
        """Apply an operational scenario. A real feed may legitimately refuse."""

    def seek(self, depth_tvd: float) -> None:
        """Move the active depth. Only meaningful for a replayable source."""

    def reset(self, well_id: str, depth_tvd: Optional[float] = None) -> None:
        """Return to the baseline for a well."""

    def start(self) -> None: ...

    def pause(self) -> None: ...

    def set_speed(self, multiplier: float) -> None:
        """Playback rate. A live feed is 1.0 by definition and should ignore this."""


class SimulatedTelemetrySource:
    """
    Adapter over the in-process simulator.

    Behaviour is identical to calling `telemetry_simulator` directly — this only
    gives it the shape a real source would have, so the API layer is already written
    against the interface and not against the simulator.
    """

    name = "simulator"

    #: A simulator can be driven: scenarios injected, depth scrubbed, time compressed.
    #: A live feed cannot do any of these, and the API reports the difference so the
    #: UI can hide controls that would be no-ops against a rig.
    capabilities = {"replay": True, "inject_scenario": True, "seek": True, "speed": True}

    def __init__(self) -> None:
        from simulator import telemetry_simulator

        self._sim = telemetry_simulator

    def status(self) -> Dict[str, Any]:
        return self._sim.get_status()

    def set_scenario(self, scenario: str) -> Dict[str, Any]:
        return self._sim.set_scenario(scenario)

    def seek(self, depth_tvd: float) -> None:
        self._sim.depth_tvd = depth_tvd

    def reset(self, well_id: str, depth_tvd: Optional[float] = None) -> None:
        self._sim.reset(well_id=well_id, depth_tvd=depth_tvd)

    def start(self) -> None:
        self._sim.start()

    def pause(self) -> None:
        self._sim.pause()

    def set_speed(self, multiplier: float) -> None:
        self._sim.speed_multiplier = multiplier


class ERTMACTelemetrySource:
    """
    Placeholder for the real eRTMAC feed. Raises on construction.

    To implement this, the following has to come from Oil India:

      1. Transport        — WITSML 1.4.1.1 or 2.0, a REST endpoint, or a raw socket?
                            Push subscription or poll, and at what interval?
      2. Auth             — service account, certificate, or IP allow-list?
      3. Well/trajectory  — how a well is identified, and how its trajectory is
                            obtained (survey stations, or derived from MD/TVD pairs).
      4. Channel mapping  — the WITSML mnemonics or tag names for ROP, WOB, RPM,
                            torque, SPP, flow-out, pit volume, mud weight and ECD.
      5. Units            — eRTMAC's native units per channel. The simulator works in
                            m/h, klbf, ft-lbf, psi, ppg and bbl; a feed in ft/hr,
                            kN, N·m or kg/m3 needs conversion at this boundary.
      6. Depth semantics  — MD or TVD, and which datum the depths are referred to.
      7. Latency          — whether a reading is live or already archived.

    Until those are answered, `SimulatedTelemetrySource` is the only source, and the
    API reports which one is active rather than leaving the caller to guess.
    """

    name = "ertmac"
    capabilities = {"replay": False, "inject_scenario": False, "seek": False, "speed": False}

    def __init__(self, *_: Any, **__: Any) -> None:
        raise NotImplementedError(
            "No eRTMAC telemetry source is implemented. This platform ships a simulator "
            "only; integrating the live feed requires the interface details listed in "
            "backend/services/telemetry.py (transport, auth, channel mapping, units, "
            "depth semantics). Set TELEMETRY_SOURCE=simulator, or implement this class."
        )


def get_telemetry_source() -> TelemetrySource:
    """
    Return the configured telemetry source.

    Selected by `TELEMETRY_SOURCE` (default `simulator`). An unknown value raises
    rather than quietly falling back — silently serving simulated data to a
    deployment that asked for a live feed is the failure mode worth avoiding.
    """
    requested = (os.getenv("TELEMETRY_SOURCE") or "simulator").strip().lower()

    if requested in ("simulator", "sim", ""):
        return SimulatedTelemetrySource()

    if requested == "ertmac":
        return ERTMACTelemetrySource()  # raises NotImplementedError, by design

    raise ValueError(
        f"Unknown TELEMETRY_SOURCE {requested!r}. Expected 'simulator' or 'ertmac'."
    )
