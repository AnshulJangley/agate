import { useNavigate } from 'react-router-dom';
import { useWell } from '../context/WellContext';
import { getDefaultOffsetWell } from '../lib/wells';

import BacktestResultsModal from '../components/BacktestResultsModal';
import ContributeLessonModal from '../components/ContributeLessonModal';
import CorrelationPanel from '../components/CorrelationPanel';
import DataTransparencyModal from '../components/DataTransparencyModal';
import AiModelModal from '../components/AiModelModal';
import LookAheadRadar from '../components/LookAheadRadar';
import PPFGWindowModal from '../components/PPFGWindowModal';
import PreSpudDossierModal from '../components/PreSpudDossierModal';

/**
 * Route wrappers around the existing feature components.
 *
 * These are unchanged modal components. Rendering them with `isOpen` pinned to
 * true and `onClose` navigating back turns each one into a full page without
 * touching its internals - which keeps this refactor staged rather than a
 * big-bang rewrite of a 3,200-line component.
 */

function useCloseTo(home = '/') {
  const navigate = useNavigate();
  return () => navigate(home);
}

export function RadarPage() {
  const { selectedWell } = useWell();
  const close = useCloseTo();
  return <LookAheadRadar isOpen onClose={close} activeWellId={selectedWell} isFullScreen />;
}

export function PPFGPage() {
  const { selectedWell } = useWell();
  const close = useCloseTo();
  return <PPFGWindowModal isOpen onClose={close} activeWellId={selectedWell} isFullScreen />;
}

export function DossierPage() {
  const { selectedWell } = useWell();
  const close = useCloseTo();
  return <PreSpudDossierModal isOpen onClose={close} activeWellId={selectedWell} isFullScreen />;
}

export function BacktestPage() {
  const close = useCloseTo();
  return <BacktestResultsModal isOpen onClose={close} isFullScreen />;
}

export function CorrelationPage() {
  const { selectedWell } = useWell();
  const close = useCloseTo();
  return (
    <CorrelationPanel
      isOpen
      onClose={close}
      activeWell={selectedWell}
      offsetWell={getDefaultOffsetWell(selectedWell)}
      isFullScreen
    />
  );
}

export function ContributePage() {
  const { selectedWell } = useWell();
  const close = useCloseTo();
  return (
    <ContributeLessonModal
      isOpen
      onClose={close}
      defaultWellId={selectedWell}
      onContributed={close}
    />
  );
}

export function MethodologyPage() {
  const close = useCloseTo();
  return <DataTransparencyModal isOpen onClose={close} />;
}

export function SettingsPage() {
  const close = useCloseTo();
  return <AiModelModal isOpen onClose={close} />;
}
