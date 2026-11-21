# MZ Vids Studio

Saved Models preserve the selected model ID, provider, endpoint and **secret name** across visits. API key values stay in server Secrets and are never saved to model presets or browser storage. No Wan model is selected by default.

## Generate video

For free generation, select **Use free LTX video renderer**. This saves the official Lightricks LTX Video 0.9.8 Distilled demo with the Hugging Face Space adapter and `none` secret binding. No key is needed. An existing Hugging Face token can optionally be bound as `HF_TOKEN`; OpenRouter/Wan credentials are never sent to this demo. The button selects a two-second silent clip at 480p, supports text or one start image, and uses the public shared GPU quota. Quota errors are reported without switching to paid models. Outputs are temporary files hosted by the demo, so download completed clips.

`WAN_API_KEY`, `OPENROUTER_API_KEY` and `HF_TOKEN` are credential names, not model IDs. The model-ID field rejects them.

1. Configure the provider key in Google AI Studio **Settings → Secrets**. OpenRouter script directors and video models use `OPENROUTER_API_KEY`.
2. Select a saved model. Video models submit directly to their saved provider. A text model such as `moonshotai/kimi-k3.1-pro` writes a shooting script and needs a separate saved video renderer.
3. If no renderer is saved, use **Add a video renderer from the live catalog**. This saves the chosen video model with the OpenRouter provider and key binding. Video generation consumes provider credits.
4. Set the prompt, reference images, duration, resolution and aspect ratio, then select **Generate Video**. The server checks the video model's live capabilities before submission. Unsupported settings produce an error.

For a saved text director, Generate Video calls that exact director model, then sends its shooting script **and the original user prompt** to the saved video renderer. The output inspector reports the renderer, director and secret name actually used. Provider or director errors stop generation; a canvas animation is never substituted for model-generated video.

External endpoints use the selected provider adapter and saved secret binding. An explicitly selected missing secret fails rather than falling back to another key. Custom hosts must be configured in the server endpoint settings. Existing Wan adapters remain available only when explicitly configured.

OpenRouter video uses `POST /api/v1/videos`, status polling, and a server-side authenticated content download. Jobs are tracked in server memory; download finished videos before restarting the server. Browser settings persist locally, with a server backup in ignored `.mz-vids-saved-models.json` (ephemeral hosting may discard that backup).

## Development

Use Node.js 24 and run `npm ci`, `npm run dev`. Validation: `npm run lint`, `npm test`, `npm run build`. CI runs these checks on Ubuntu. The integration test mocks provider responses and never spends API credits.

Provider reference: [OpenRouter video generation](https://openrouter.ai/docs/guides/overview/multimodal/video-generation).
