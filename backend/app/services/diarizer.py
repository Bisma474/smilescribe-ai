# =============================================================================
# diarizer.py — Speaker diarization with pyannote.audio
# =============================================================================

import logging
import warnings
from pyannote.core import Annotation

# Suppress noisy torchcodec warnings from pyannote (import + runtime).
warnings.filterwarnings(
    "ignore",
    category=UserWarning,
    module=r"pyannote\.audio\.core\.io",
    message=r".*(torchcodec is not installed correctly|Could not load libtorchcodec).*",
)
from pyannote.audio import Pipeline

logger = logging.getLogger(__name__)


def load_diarization_pipeline(model_name: str, hf_token: str) -> Pipeline:
    """Load and return the pyannote diarization pipeline."""
    hf_token= "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"
    if not hf_token or hf_token == "YOUR_HF_TOKEN_HERE":
        raise ValueError(
            "Hugging Face token is missing. Set HF_TOKEN in config.py or pass --hf-token."
        )

    logger.info(f"Loading diarization pipeline: '{model_name}'...")
 
    auth_kwargs = ({"token": hf_token}, {"use_auth_token": hf_token})

    for kwargs in auth_kwargs:
        try:
            pipeline = Pipeline.from_pretrained(model_name, **kwargs)
            #pipeline = Pipeline.from_pretrained(model_name, use_auth_token=hf_token)
            logger.info("Diarization pipeline loaded successfully.")
            return pipeline
        except TypeError:
            continue
        except Exception as exc:
            msg = str(exc).lower()
            if "gated" in msg or "401" in msg or "unauthorized" in msg:
                logger.error(
                    "Cannot access gated model '%s'. Ensure all of the following: "
                    "(1) your token is valid, (2) you accepted model terms at "
                    # "https://huggingface.co/pyannote/speaker-diarization-community-1, "
                    "https://huggingface.co/pyannote/speaker-diarization-3.1, "
                    "and any dependent pyannote models, and (3) token has read access.",
                    model_name,
                )
            raise

    raise RuntimeError(
        "Could not authenticate pyannote pipeline loader. "
        "Try upgrading pyannote.audio and huggingface_hub."
    )


def diarize_audio(pipeline: Pipeline, audio_input, num_speakers: int = None):
    """
    Run speaker diarization on the audio.

    `audio_input` can be:
      - a file path string (requires ffmpeg / torchcodec)
      - a dict {"waveform": tensor, "sample_rate": int}  ← preferred, no ffmpeg

    Returns a pyannote Annotation object.
    """
    if isinstance(audio_input, dict):
        logger.info("Running diarization on pre-loaded waveform tensor.")
    else:
        logger.info(f"Running diarization on file: {audio_input}")

    with warnings.catch_warnings():
        warnings.filterwarnings(
            "ignore",
            category=UserWarning,
            module=r"pyannote\.audio\.core\.io",
            message=r".*(torchcodec is not installed correctly|Could not load libtorchcodec).*",
        )
        if num_speakers is not None:
            logger.info(f"Forcing diarization to find exactly {num_speakers} speakers.")
            diarization = pipeline(audio_input, num_speakers=num_speakers)
        else:
            diarization = pipeline(audio_input)
    logger.info("Diarization complete.")
    return diarization

def _to_annotation(result) -> Annotation:
    if isinstance(result, Annotation):
        return result
    for attr in ("diarization", "annotation", "output"):
        candidate = getattr(result, attr, None)
        if isinstance(candidate, Annotation):
            return candidate
    raise TypeError(
        f"Unsupported diarization result type: {type(result)!r}. "
        f"Available attrs: {[a for a in dir(result) if not a.startswith('_')]}"
    )


def print_diarization_output(diarization) -> None:
    """Pretty-print the raw diarization speaker turns."""
    print("\n" + "=" * 60)
    print("RAW DIARIZATION OUTPUT")
    print("=" * 60)

    # Unwrap DiarizeOutput or any wrapper to get the Annotation
    ann = diarization
    for attr in ("diarization", "annotation", "output"):
        candidate = getattr(diarization, attr, None)
        if isinstance(candidate, Annotation):
            ann = candidate
            break
    
    if not isinstance(ann, Annotation):
        # Last resort: print all attributes to find the Annotation
        logger.error("Could not unwrap diarization result. Attributes: %s", vars(diarization))
        raise TypeError(f"Cannot extract Annotation from {type(diarization)!r}. See logs.")

    for turn, _, speaker in ann.itertracks(yield_label=True):
        print(f"  {speaker:<12} | {turn.start:6.2f}s — {turn.end:6.2f}s")