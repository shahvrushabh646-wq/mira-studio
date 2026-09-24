# Mira Studio

Mira Studio opens in **Free Motion** mode. Turn a still image into a short camera-motion video directly in your browser. No GPU server, account, API key, or image upload is needed.

## Free Motion mode

- Choose an image and write a creative direction.
- Choose vertical or landscape format, camera style, intensity, and a 4, 7, or 15 second duration.
- Create a local shot plan and render the motion film in the browser.
- Preview and save the result as WebM.

This mode moves the camera over the still image. It does not invent motion inside people or objects. Your image stays on the page while rendering.

## AI video mode (optional)

Wan 2.2 mode creates real AI-generated scene motion. It needs a separately hosted GPU API and can cost money. Vercel hosts Mira's web interface; it does not provide the video-generation GPU. The `mira-wan-gpu/` folder contains the optional FastAPI GPU service configuration.

When you use AI mode, scene analysis sends a resized image to the public Hugging Face Qwen Vision Space. Video generation sends the image to the GPU URL configured in the app.

## Run or deploy

Requires Node.js 22. Install dependencies and start the app:

```powershell
npm install
npm run dev
```

To deploy to Vercel, import the project repository. The included `vercel.json` configures the Vite build and output directory. Free Motion works without setting any environment variables.

