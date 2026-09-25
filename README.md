# Mira Studio

Mira Studio offers a free local classroom-animation mode and optional AI image-to-video modes.

## Free local classroom video

1. Upload an image and choose **Unlimited free local classroom video • stylized** (the default).
2. Set a lesson topic and story, then select **Write local story**.
3. Select **Render unlimited local classroom video** and save the WebM file.

This mode runs in your browser without an account, GPU, cloud service, or per-render quota. It draws a stylized 2D classroom with an animated teacher, students, lesson beats, captions, and your uploaded picture as a classroom reference card. Mira does not analyze the picture in this mode, animate the pictured people, or create photoreal AI video. Clips are capped at five minutes; render speed and storage depend on your device. Video is silent.

## Photoreal AI video

Choose **Photoreal AI video • shared daily GPU limit** to analyze the uploaded picture and request a short Wan 2.2 image-to-video clip. This sends the image to Hugging Face's public service, which has shared GPU quotas and queues. AI renders therefore are not unlimited. A dedicated Wan 2.2 GPU server can be configured in the GPU mode, but running that server may incur costs.

## Other mode

**Local camera motion** creates a WebM with camera movement over the still image. People and objects remain still.

## Run or deploy

Requires Node.js 22. Install dependencies and start the app:

```powershell
pnpm install
pnpm run dev
```

To deploy to Vercel, import the repository. The included `vercel.json` configures the Vite build and output directory.

