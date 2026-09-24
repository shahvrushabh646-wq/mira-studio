# Mira Wan 2.2 Dedicated GPU Backend

Dedicated private Wan 2.2 image-to-video backend for Mira Studio. Real AI generation only; no public/free GPU fallback and no fake zoom/pan animation.

Expected API: /health, /capabilities, /generate, /jobs/{job_id}, /gpu, /diagnostics.

Deploy this backend on the dedicated CUDA GPU and configure its API URL in Mira Studio settings.
