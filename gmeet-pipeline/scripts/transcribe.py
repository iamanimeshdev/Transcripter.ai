#!/usr/bin/env python3
"""
WhisperX Transcription Script (CPU-Only)
Called by Node.js to transcribe audio files.

Usage:
    python transcribe.py <audio_path> [options]

Options:
    --language LANG     Audio language (default: auto-detect)
    --model MODEL       Whisper model size (default: small)
    --output FORMAT     Output format: json or text (default: json)

Output (JSON):
    {
        "segments": [
            {
                "start": 0.0,
                "end": 2.5,
                "text": "Hello, welcome to the meeting."
            },
            ...
        ],
        "language": "en",
        "duration": 120.5
    }
"""

import argparse
import json
import os
import sys
import warnings
import logging

# Suppress warnings and logs for cleaner stdout (which Node.js parses as JSON)
warnings.filterwarnings("ignore")
logging.getLogger("whisperx").setLevel(logging.ERROR)
logging.getLogger("pyannote").setLevel(logging.ERROR)
# Silence Lightning / Torch warnings that leak to stdout
os.environ["PYTHONWARNINGS"] = "ignore"

# ── Global Fix for PyTorch 2.8+ weights_only ──
# WhisperX models require weights_only=False to load correctly.
import torch
import torch.serialization
_orig_load = torch.load
_orig_ser_load = torch.serialization.load

def _new_load(*args, **kwargs):
    kwargs['weights_only'] = False
    return _orig_load(*args, **kwargs)

def _new_ser_load(*args, **kwargs):
    kwargs['weights_only'] = False
    return _orig_ser_load(*args, **kwargs)

torch.load = _new_load
torch.serialization.load = _new_ser_load
print("🛠️ torch.load force-patched", file=sys.stderr)

def transcribe_audio(audio_path, language=None, model_size="small"):
    """
    Transcribe audio file using WhisperX (CPU-only).
    
    Args:
        audio_path: Path to audio file (WAV, MP3, etc.)
        language: Force specific language (None = auto-detect)
        model_size: Whisper model size (tiny, base, small)
    
    Returns:
        dict with segments, language, and duration
    """
    import whisperx

    # Force CPU — no CUDA to avoid OOM on GTX 1650
    device = "cpu"
    compute_type = "int8"
    
    print(f"Device: {device}", file=sys.stderr)
    print(f"Loading model: {model_size}", file=sys.stderr)

    # Load model
    model = whisperx.load_model(
        model_size,
        device,
        compute_type=compute_type,
        language=language
    )

    # Load audio
    print(f"Loading audio: {audio_path}", file=sys.stderr)
    audio = whisperx.load_audio(audio_path)
    
    # Get audio duration
    duration = len(audio) / 16000  # WhisperX uses 16kHz

    # Transcribe
    print("Transcribing...", file=sys.stderr)
    result = model.transcribe(audio, batch_size=16)
    
    # Language handling: prioritize passed language, then detected, default to 'en'
    detected_language = result.get("language")
    if language:
        final_lang = language
    elif detected_language:
        final_lang = detected_language
    else:
        final_lang = "en"
    
    print(f"Detected language: {detected_language} (using {final_lang})", file=sys.stderr)

    # Align timestamps for better accuracy (CPU)
    # Alignment is optional and wrapped in try-except to handle network/missing model errors
    print(f"Aligning timestamps for {final_lang}...", file=sys.stderr)
    try:
        model_a, metadata = whisperx.load_align_model(
            language_code=final_lang,
            device="cpu"
        )
        result = whisperx.align(
            result["segments"],
            model_a,
            metadata,
            audio,
            device="cpu",
            return_char_alignments=False
        )
        segments = result["segments"]
    except Exception as e:
        print(f"⚠️ Alignment skipped: {str(e)}", file=sys.stderr)
        segments = result["segments"]

    # Format output
    output_segments = []
    for seg in segments:
        output_segments.append({
            "start": round(seg.get("start", 0), 2),
            "end": round(seg.get("end", 0), 2),
            "text": seg.get("text", "").strip()
        })

    return {
        "segments": output_segments,
        "language": detected_language,
        "duration": round(duration, 2)
    }


def format_as_text(result):
    """Convert result to plain text format with timestamps."""
    lines = []
    
    for seg in result["segments"]:
        start = seg.get("start", 0)
        end = seg.get("end", 0)
        text = seg["text"]
        lines.append(f"[{start:>6.1f}s → {end:>6.1f}s]  {text}")
    
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="Transcribe audio with WhisperX (CPU-only)")
    parser.add_argument("audio_path", help="Path to audio file")
    parser.add_argument("--language", default=None, help="Audio language (default: auto)")
    parser.add_argument("--model", default="small", help="Model size (default: small)")
    parser.add_argument("--output", default="json", choices=["json", "text"], help="Output format")
    
    args = parser.parse_args()

    # Validate input file
    if not os.path.exists(args.audio_path):
        print(json.dumps({"error": f"File not found: {args.audio_path}"}))
        sys.exit(1)

    try:
        result = transcribe_audio(
            audio_path=args.audio_path,
            language=args.language,
            model_size=args.model
        )

        if args.output == "json":
            print(json.dumps(result, ensure_ascii=False))
        else:
            print(format_as_text(result))

    except Exception as e:
        import traceback
        traceback.print_exc(file=sys.stderr)
        error_result = {
            "error": str(e),
            "error_type": type(e).__name__
        }
        print(json.dumps(error_result))
        sys.exit(1)


if __name__ == "__main__":
    main()
