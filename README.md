# Mira Studio

Mira Studio turns a reference image into an AI-directed video. It opens in **Free AI video** mode with the **Active classroom lesson** scene format selected.

## Free AI video

1. Upload an image, such as an instructor or education poster.
2. Keep **Active classroom lesson** selected to stage the visible instructor as a teacher with students and a board, or choose **Animate the uploaded scene** to preserve the existing scene.
3. Set the creative direction and choose a short 4–5 second clip.
4. Build the director plan, review it, then select **Generate real AI video**.

Video generation calls a public Hugging Face Wan 2.2 ZeroGPU Space directly from the browser. It requires no Mira account, key, or GPU setup. The image is uploaded to Hugging Face for analysis/generation. The public service has a daily GPU quota and shared queues; access may be busy or unavailable, so usage is not unlimited. Generated clips are silent and about five seconds long.

## Other modes

- **Local camera motion** renders an instant WebM in the browser. It moves the camera over the image; it does not animate people or objects.
- **My Wan 2.2 GPU server** supports a user-configured server for longer AI video jobs and stitching.

## Run or deploy

Requires Node.js 22. Install dependencies and start the app:

```powershell
npm install
npm run dev
```

To deploy to Vercel, import the project repository. The included `vercel.json` configures the Vite build and output directory. Free AI uses the public shared service and does not require Vercel secrets.

