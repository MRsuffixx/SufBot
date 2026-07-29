# Welcome cards

Cards support bounded dimensions, background fit/position, overlay, approved font families, text and
accent colors, avatar size/shape/border, alignment, server icon, templates, PNG/JPEG, and
compression quality. The bot submits a deterministic `onboarding.generate-welcome-card` job and
waits for the worker for at most ten seconds. Worker concurrency is two with a global limiter. If
generation or the worker fails, the original welcome message is sent without a card.

Remote URLs are never fetched by dashboard preview code. The worker permits HTTPS on port 443
without URL credentials, resolves DNS, rejects loopback/private/link-local/reserved/multicast
addresses, pins the vetted address for the request, revalidates up to two redirects, permits only
PNG/JPEG/WebP/GIF, and bounds timeout, declared/received bytes, decoded pixels/dimensions, and final
output. User SVG is rejected. Internally generated SVG overlays contain XML-escaped, length-clipped
text.

Custom background URLs use the centralized plan limit (`0` free, configured Premium capacity). After
Premium revocation, the worker ignores a previously saved custom background. Uploaded object storage
is not implemented; use an approved public HTTPS raster host.
