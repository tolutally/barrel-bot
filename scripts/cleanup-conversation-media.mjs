const base = process.env.BARREL_API_URL;
const secret = process.env.MEDIA_CLEANUP_SECRET;
if (!base || !secret) throw new Error("BARREL_API_URL and MEDIA_CLEANUP_SECRET are required");

const response = await fetch(new URL("/api/internal/media/cleanup", base), {
  method: "POST",
  headers: { Authorization: `Bearer ${secret}` },
});
if (!response.ok) throw new Error(`Media cleanup failed with HTTP ${response.status}`);
const result = await response.json();
console.info(`Expired ${Number(result.expired ?? 0)} conversation attachment(s)`);
