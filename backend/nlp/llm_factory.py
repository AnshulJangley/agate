import os
import socket
import logging
from typing import Optional, Dict, Any, Tuple
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

# Provider Constants
PROVIDER_GEMINI = "gemini"
PROVIDER_CLAUDE = "claude"
PROVIDER_OPENAI = "openai"
PROVIDER_OLLAMA = "ollama"
PROVIDER_OFFLINE = "offline"

# Model Defaults
# Gemini is addressed via the -latest alias: the previously pinned
# "gemini-1.5-flash" was retired by Google and now returns 404 NOT_FOUND on
# generateContent, which silently dropped the app to its offline path.
DEFAULT_MODELS = {
    PROVIDER_GEMINI: "gemini-3.5-flash",
    PROVIDER_CLAUDE: "claude-haiku-4-5-20251001",
    PROVIDER_OPENAI: "gpt-4o-mini",
    PROVIDER_OLLAMA: "llama3",
}

def _clean_key(val: Optional[str]) -> Optional[str]:
    """Returns key if non-empty and not a dummy placeholder."""
    if not val:
        return None
    v = val.strip()
    if v.lower() in {"your-api-key-here", "none", "", "placeholder", "your_api_key_here", "dummy"}:
        return None
    return v

def _is_port_open(host: str, port: int, timeout: float = 0.2) -> bool:
    """Quick socket check to see if local service like Ollama is responsive."""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        result = sock.connect_ex((host, port))
        sock.close()
        return result == 0
    except Exception:
        return False

def get_configured_providers() -> Dict[str, Dict[str, Any]]:
    """Inspects environment variables and returns configured status of all 4 providers."""
    # 1. Gemini
    gemini_key = _clean_key(os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"))
    gemini_model = os.getenv("GEMINI_MODEL_NAME", DEFAULT_MODELS[PROVIDER_GEMINI])
    
    # 2. Claude
    claude_key = _clean_key(os.getenv("ANTHROPIC_API_KEY") or os.getenv("CLAUDE_API_KEY"))
    claude_model = os.getenv("ANTHROPIC_MODEL_NAME", DEFAULT_MODELS[PROVIDER_CLAUDE])
    
    # 3. OpenAI
    openai_key = _clean_key(os.getenv("OPENAI_API_KEY"))
    openai_model = os.getenv("OPENAI_MODEL_NAME", DEFAULT_MODELS[PROVIDER_OPENAI])
    openai_base = os.getenv("OPENAI_BASE_URL")
    
    # 4. Ollama
    ollama_endpoint = os.getenv("OLLAMA_ENDPOINT") or os.getenv("LLM_ENDPOINT", "http://localhost:11434/v1")
    ollama_model = os.getenv("OLLAMA_MODEL_NAME") or os.getenv("LLM_MODEL_NAME", DEFAULT_MODELS[PROVIDER_OLLAMA])
    
    # Generic fallback key handling (backward compatibility)
    generic_key = _clean_key(os.getenv("LLM_API_KEY"))
    if generic_key and not openai_key and not gemini_key and not claude_key:
        if generic_key.startswith("AIza"):
            gemini_key = generic_key
        elif generic_key.startswith("sk-ant-"):
            claude_key = generic_key
        elif generic_key.startswith("sk-"):
            openai_key = generic_key

    # Check Ollama connectivity
    ollama_host = "127.0.0.1"
    ollama_port = 11434
    try:
        parsed = urlparse(ollama_endpoint)
        if parsed.hostname:
            ollama_host = parsed.hostname
        if parsed.port:
            ollama_port = parsed.port
    except Exception:
        pass
        
    ollama_online = _is_port_open(ollama_host, ollama_port)

    return {
        PROVIDER_GEMINI: {
            "name": "Google Gemini",
            "available": gemini_key is not None,
            "api_key": gemini_key,
            "model": gemini_model,
        },
        PROVIDER_CLAUDE: {
            "name": "Anthropic Claude",
            "available": claude_key is not None,
            "api_key": claude_key,
            "model": claude_model,
        },
        PROVIDER_OPENAI: {
            "name": "OpenAI",
            "available": openai_key is not None,
            "api_key": openai_key,
            "model": openai_model,
            "base_url": openai_base,
        },
        PROVIDER_OLLAMA: {
            "name": "Ollama (Local)",
            "available": ollama_online,
            "endpoint": ollama_endpoint,
            "model": ollama_model,
        },
    }

def detect_active_provider() -> Tuple[str, str]:
    """
    Determines the active provider and model based on explicit choice or auto-detection.
    Returns: (provider_id, model_name)
    """
    explicit = os.getenv("LLM_PROVIDER", "auto").strip().lower()
    providers = get_configured_providers()

    if explicit in {PROVIDER_GEMINI, "google"}:
        return PROVIDER_GEMINI, providers[PROVIDER_GEMINI]["model"]
    elif explicit in {PROVIDER_CLAUDE, "anthropic"}:
        return PROVIDER_CLAUDE, providers[PROVIDER_CLAUDE]["model"]
    elif explicit in {PROVIDER_OPENAI}:
        return PROVIDER_OPENAI, providers[PROVIDER_OPENAI]["model"]
    elif explicit in {PROVIDER_OLLAMA, "local"}:
        return PROVIDER_OLLAMA, providers[PROVIDER_OLLAMA]["model"]

    # Auto-detection priority
    if providers[PROVIDER_GEMINI]["available"]:
        return PROVIDER_GEMINI, providers[PROVIDER_GEMINI]["model"]
    if providers[PROVIDER_CLAUDE]["available"]:
        return PROVIDER_CLAUDE, providers[PROVIDER_CLAUDE]["model"]
    if providers[PROVIDER_OPENAI]["available"]:
        return PROVIDER_OPENAI, providers[PROVIDER_OPENAI]["model"]
    if providers[PROVIDER_OLLAMA]["available"]:
        return PROVIDER_OLLAMA, providers[PROVIDER_OLLAMA]["model"]

    # If nothing is configured or reachable, return offline
    return PROVIDER_OFFLINE, "rule_based_fallback"

def is_llm_available(provider: Optional[str] = None) -> bool:
    """Returns True if the selected or auto-detected LLM is ready to use."""
    providers = get_configured_providers()
    if provider:
        p = provider.lower()
        return bool(providers.get(p, {}).get("available", False))
    
    active, _ = detect_active_provider()
    return active != PROVIDER_OFFLINE

def get_llm(
    provider: Optional[str] = None,
    model: Optional[str] = None,
    temperature: float = 0.0,
    timeout: float = 6.0
):
    """
    Factory function instantiating the appropriate LangChain model instance.
    Supports: Google Gemini, Anthropic Claude, OpenAI, and Ollama (Local).
    """
    providers = get_configured_providers()
    active_provider, _ = detect_active_provider()
    chosen_provider = provider.lower() if provider else active_provider
    provider_default_model = providers.get(chosen_provider, {}).get("model", DEFAULT_MODELS.get(chosen_provider, "default_model"))
    chosen_model = model or provider_default_model

    if chosen_provider in {PROVIDER_GEMINI, "google"}:
        cfg = providers[PROVIDER_GEMINI]
        api_key = cfg["api_key"] or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        try:
            from langchain_google_genai import ChatGoogleGenerativeAI
            return ChatGoogleGenerativeAI(
                model=chosen_model,
                api_key=api_key,
                temperature=temperature,
                timeout=timeout,
                max_retries=0
            )
        except Exception as e:
            logger.warning(f"Native ChatGoogleGenerativeAI init error ({e}). Using official OpenAI-compatible endpoint.")
            from langchain_openai import ChatOpenAI
            return ChatOpenAI(
                model=chosen_model,
                api_key=api_key,
                base_url="https://generativelanguage.googleapis.com/v1beta/openai/",
                temperature=temperature,
                timeout=timeout,
                max_retries=0
            )

    elif chosen_provider in {PROVIDER_CLAUDE, "anthropic"}:
        from langchain_anthropic import ChatAnthropic
        cfg = providers[PROVIDER_CLAUDE]
        api_key = cfg["api_key"] or os.getenv("ANTHROPIC_API_KEY") or os.getenv("CLAUDE_API_KEY")
        return ChatAnthropic(
            model_name=chosen_model,
            api_key=api_key,
            temperature=temperature,
            timeout=timeout,
            max_retries=0
        )

    elif chosen_provider == PROVIDER_OPENAI:
        from langchain_openai import ChatOpenAI
        cfg = providers[PROVIDER_OPENAI]
        api_key = cfg["api_key"] or os.getenv("OPENAI_API_KEY")
        return ChatOpenAI(
            model=chosen_model,
            api_key=api_key,
            base_url=cfg.get("base_url"),
            temperature=temperature,
            timeout=timeout,
            max_retries=0
        )

    elif chosen_provider in {PROVIDER_OLLAMA, "local"}:
        from langchain_openai import ChatOpenAI
        cfg = providers[PROVIDER_OLLAMA]
        endpoint = cfg.get("endpoint") or "http://localhost:11434/v1"
        return ChatOpenAI(
            model=chosen_model,
            base_url=endpoint,
            api_key=os.getenv("LLM_API_KEY") or "ollama",
            temperature=temperature,
            timeout=timeout,
            max_retries=0
        )

    else:
        raise RuntimeError(f"No active LLM provider configured or available. Running in offline rule-based mode.")

def get_llm_candidates(temperature: float = 0.0, timeout: float = 20.0):
    """
    Returns ``[(provider, model, llm), ...]`` in failover order: the
    auto-detected provider first, then every other available provider.

    Why this exists: with a single provider the app degrades straight to the
    deterministic answer whenever that one provider hiccups. A transient 503
    from Gemini (observed 2026-09-29) therefore looked identical to having no
    API key at all, even while a healthy Claude key was sitting right there.
    Silent degradation to "offline" is the failure mode that hid this codebase's
    zero-embedding bug for weeks, so callers should retry down this list rather
    than treating one failure as "no LLM available".

    Providers that fail to instantiate are skipped, not raised.
    """
    providers = get_configured_providers()
    active, _ = detect_active_provider()

    order = [active] + [p for p in (PROVIDER_GEMINI, PROVIDER_CLAUDE, PROVIDER_OPENAI)
                        if p != active]

    candidates = []
    for name in order:
        if name == PROVIDER_OFFLINE:
            continue
        cfg = providers.get(name) or {}
        if not cfg.get("available"):
            continue
        try:
            llm = get_llm(provider=name, temperature=temperature, timeout=timeout)
        except Exception as e:
            logger.warning(f"Skipping provider '{name}' in failover chain: {e}")
            continue
        candidates.append((name, cfg.get("model"), llm))

    return candidates


def get_llm_status() -> Dict[str, Any]:
    """Generates a comprehensive status report for UI badges and /api/ai/status."""
    providers = get_configured_providers()
    active_provider, active_model = detect_active_provider()
    
    available_list = [k for k, v in providers.items() if v["available"]]

    return {
        "active_provider": active_provider,
        "active_model": active_model,
        "is_connected": active_provider != PROVIDER_OFFLINE,
        "mode": "live_llm" if active_provider != PROVIDER_OFFLINE else "offline_deterministic",
        "available_providers": available_list,
        "provider_details": {
            k: {
                "name": v["name"],
                "available": v["available"],
                "model": v["model"],
            }
            for k, v in providers.items()
        }
    }
