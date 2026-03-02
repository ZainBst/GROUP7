import os
import platform


def resolve_insightface_runtime():
    """
    Return (providers, ctx_id) for InsightFace in a cross-platform way.
    - Windows: prefer CUDA, then DirectML, then CPU
    - macOS: prefer CoreML, then CPU
    - Linux/other: prefer CUDA, then CPU
    """
    os_name = platform.system().lower()

    try:
        import onnxruntime as ort

        available = set(ort.get_available_providers())
    except Exception:
        available = set()

    if os_name == "windows":
        preferred = ["CUDAExecutionProvider", "DmlExecutionProvider", "CPUExecutionProvider"]
    elif os_name == "darwin":
        preferred = ["CoreMLExecutionProvider", "CPUExecutionProvider"]
    else:
        preferred = ["CUDAExecutionProvider", "CPUExecutionProvider"]

    providers = [p for p in preferred if not available or p in available]
    if "CPUExecutionProvider" not in providers:
        providers.append("CPUExecutionProvider")

    accelerated = any(
        p in providers for p in ("CUDAExecutionProvider", "CoreMLExecutionProvider", "DmlExecutionProvider")
    )
    ctx_id = 0 if accelerated else -1
    return providers, ctx_id


def get_acceleration_status():
    """
    Collect runtime acceleration details for diagnostics endpoints.
    """
    status = {
        "platform": platform.system(),
        "python_env": {
            "nvidia_enabled_env": os.getenv("NVIDIA_ACCELERATION", "").strip().lower() in {"1", "true", "yes", "on"},
            "force_torch_device": os.getenv("FORCE_TORCH_DEVICE", ""),
        },
        "torch": {
            "installed": False,
            "cuda_available": False,
            "cuda_version": None,
            "selected_device": "cpu",
            "device_name": None,
        },
        "onnxruntime": {
            "installed": False,
            "available_providers": [],
            "selected_providers": [],
            "accelerated_provider_selected": False,
        },
    }

    try:
        import torch

        status["torch"]["installed"] = True
        status["torch"]["cuda_available"] = bool(torch.cuda.is_available())
        status["torch"]["cuda_version"] = torch.version.cuda
        if status["torch"]["cuda_available"]:
            status["torch"]["selected_device"] = "cuda"
            status["torch"]["device_name"] = torch.cuda.get_device_name(0)
        elif getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
            status["torch"]["selected_device"] = "mps"
    except Exception:
        pass

    try:
        import onnxruntime as ort

        available = ort.get_available_providers()
        selected, _ = resolve_insightface_runtime()
        status["onnxruntime"]["installed"] = True
        status["onnxruntime"]["available_providers"] = available
        status["onnxruntime"]["selected_providers"] = selected
        status["onnxruntime"]["accelerated_provider_selected"] = any(
            provider in selected
            for provider in ("CUDAExecutionProvider", "CoreMLExecutionProvider", "DmlExecutionProvider")
        )
    except Exception:
        pass

    status["cuda_fully_enabled"] = bool(
        status["torch"]["cuda_available"] and status["onnxruntime"]["accelerated_provider_selected"]
    )
    return status
