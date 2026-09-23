import { fal } from "@fal-ai/client";

const MODEL = "fal-ai/kling-video/v3/standard/image-to-video";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!process.env.FAL_KEY) {
    return res.status(500).json({
      error: "FAL_KEY is not configured. Check Vercel Environment Variables and redeploy."
    });
  }

  try {
    const {
      imageData,
      brief,
      shots,
      duration,
      style,
      motion,
      intensity,
      negativePrompt
    } = req.body || {};

    if (!imageData || !Array.isArray(shots) || shots.length === 0) {
      return res.status(400).json({
        error: "Product image and director plan are required."
      });
    }

    if (!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(imageData)) {
      return res.status(400).json({
        error: "Invalid prepared image. Please upload a JPG, PNG or WebP product image."
      });
    }

    const requestedDuration = Number(duration) || 5;
    const selectedShots = shots.slice(0, 6);
    const total = selectedShots.reduce(
      (sum, shot) => sum + Number(shot.duration || 0),
      0
    );

    if (total !== requestedDuration) {
      return res.status(400).json({
        error: `Shot durations (${total}s) do not match film duration (${requestedDuration}s). Please rebuild the director plan.`
      });
    }

    if (total < 3 || total > 15) {
      return res.status(400).json({
        error: "Total film duration must be between 3 and 15 seconds."
      });
    }

    const base64 = imageData.split(",")[1];
    if (!base64) {
      return res.status(400).json({ error: "Prepared image data is empty." });
    }

    const imageBuffer = Buffer.from(base64, "base64");
    if (!imageBuffer.length) {
      return res.status(400).json({ error: "Prepared image could not be decoded." });
    }

    const imageFile = new File(
      [imageBuffer],
      "mira-reference.jpg",
      { type: "image/jpeg" }
    );

    const uploaded = await fal.storage.upload(imageFile);
    const imageUrl =
      typeof uploaded === "string"
        ? uploaded
        : uploaded?.url || uploaded?.file?.url;

    if (!imageUrl || typeof imageUrl !== "string") {
      throw new Error("fal.ai image upload did not return a usable image URL.");
    }

    const input = {
      start_image_url: imageUrl,
      multi_prompt: selectedShots.map((shot) => ({
        prompt:
          `Product commercial shot. ${shot.action} Camera: ${shot.camera}. ${brief || ""} ` +
          `Preserve exact product identity, packaging, proportions, materials and visible text. ` +
          `Photorealistic, ${style || "premium commercial"} visual language, ` +
          `${motion || "cinematic"} camera movement at ${Number(intensity || 45)}% motion intensity, ` +
          "premium advertising cinematography, physically plausible motion, stable geometry, " +
          "no invented logos, no watermark.",
        duration: String(Number(shot.duration))
      })),
      duration: String(requestedDuration),
      shot_type: "customize",
      generate_audio: false,
      negative_prompt:
        negativePrompt ||
        "warped product, deformed packaging, duplicate product, invented logo, fake text, " +
        "watermark, distorted hands, melting, morphing, flicker, jitter, low quality"
    };

    let queued;
    try {
      queued = await fal.queue.submit(MODEL, { input });
    } catch (firstError) {
      const status = Number(firstError?.status || firstError?.statusCode);
      const fallbackPrompt = selectedShots
        .map((shot, i) => `Shot ${i + 1}: ${shot.action} Camera: ${shot.camera}.`)
        .join(" ");
      const fallbackInput = {
        start_image_url: imageUrl,
        prompt:
          `Create a continuous premium product commercial. ${fallbackPrompt} ${brief || ""} ` +
          `Preserve exact product identity, packaging, proportions, materials and visible text. ` +
          `Photorealistic, ${style || "premium commercial"} visual language, ${motion || "cinematic"} camera movement. ` +
          "Premium advertising cinematography, physically plausible motion, stable geometry, no invented logos.",
        duration: String(requestedDuration),
        generate_audio: false,
        negative_prompt:
          negativePrompt ||
          "warped product, deformed packaging, duplicate product, invented logo, fake text, watermark, distorted hands, melting, morphing, flicker, jitter, low quality"
      };

      if (status === 422) {
        queued = await fal.queue.submit(MODEL, { input: fallbackInput });
      } else {
        throw firstError;
      }
    }

    if (!queued?.request_id) {
      throw new Error("fal.ai did not return a request ID.");
    }

    return res.status(200).json({
      requestId: queued.request_id,
      model: MODEL
    });
  } catch (error) {
    console.error("MIRA_GENERATE_ERROR", {
      name: error?.name,
      message: error?.message,
      body: error?.body,
      status: error?.status
    });

    const message =
      error?.body?.detail ||
      error?.body?.message ||
      error?.message ||
      "fal.ai request failed";

    return res.status(500).json({
      error: String(message)
    });
  }
}
