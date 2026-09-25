# Mira Studio

Mira Studio studies an uploaded image, writes a story grounded in that image, and turns the story into a short video.

## Image-to-story-to-video

1. Upload any image.
2. Keep **Animate the uploaded scene** selected to preserve the visible subjects and setting. Choose **Active classroom lesson** only when you want to stage a classroom.
3. Select **Analyze image & write story** and review the scene description, story, and shot plan.
4. Select **Generate real AI video** to create a short Wan 2.2 clip.

The app uses public Hugging Face vision and Wan 2.2 GPU services. It works without a token when shared free capacity is available. If you hit a ZeroGPU run limit, you can optionally enter your own Hugging Face read token in the Generation mode settings. Mira sends that token directly from your browser to Hugging Face and does not save it. Account tokens may provide account-specific quota, but GPU access still has limits; video generation is not unlimited. Your uploaded image is sent to these public services.

## Free local option

**Free local classroom animation • stylized** renders in the browser without a GPU service or per-render quota. It is a stylized classroom animation and is not a general image understanding or photoreal video model. Local camera motion also runs in the browser, but keeps people and objects still.

## Run or deploy

Requires Node.js 22. Install dependencies and start the app:

```powershell
pnpm install
pnpm run dev
```

To deploy to Vercel, import the repository. The included `vercel.json` configures the Vite build and output directory.

