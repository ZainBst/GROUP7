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
