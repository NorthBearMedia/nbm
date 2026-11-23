#!/usr/bin/env python3
"""Accent check: CommonAccent ECAPA (Jzuluaga/accent-id-commonaccent_ecapa, SpeechBrain), an English
accent classifier trained on Common Voice speakers, with a 'scotland' class. Reports P(scotland)
and the top accents. Usage as a module: scot(path, tail=None) -> (p_scotland, [(label, p), ...])."""
import subprocess, warnings, logging
warnings.filterwarnings("ignore"); logging.disable(logging.WARNING)
import numpy as np, torch
from speechbrain.inference.classifiers import EncoderClassifier
_clf = EncoderClassifier.from_hparams(source="Jzuluaga/accent-id-commonaccent_ecapa",
                                      savedir="/tmp/claude-0/models/commonaccent", run_opts={"device": "cpu"})
_labels = _clf.hparams.label_encoder.decode_ndim(list(range(len(_clf.hparams.label_encoder.lab2ind))))

def _load(path, tail=None):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-ac", "1", "-ar", "16000", "-f", "s16le", "-"],
                         capture_output=True, check=True).stdout
    x = np.frombuffer(raw, np.int16).astype(np.float32) / 32768
    if tail: x = x[-int(tail * 16000):]
    return torch.from_numpy(x.copy()).unsqueeze(0)

def scot(path, tail=None):
    """The classifier scores are cosines to each accent (additive-margin head), not probabilities.
    Returns (margin, cos_scotland, top3): margin = cos(scotland) - best other accent's cos.
    Positive margin: it hears Scottish. Negative: it hears something else, by that much."""
    out, _, _, _ = _clf.classify_batch(_load(path, tail))
    c = dict(zip(_labels, out.squeeze(0).tolist()))
    other = max(v for k, v in c.items() if k != "scotland")
    return c["scotland"] - other, c["scotland"], sorted(c.items(), key=lambda t: -t[1])[:3]

if __name__ == "__main__":
    import sys
    for a in sys.argv[1:]:
        m, s, top = scot(a); print(f"{a}: margin {m:+.2f}  top: {', '.join(f'{l} {p:.2f}' for l, p in top)}")
