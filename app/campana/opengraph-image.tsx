import { ImageResponse } from "next/og";

export const alt = "Snapshot de investigación de Ingeniometrix";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function CampaignOpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background:
            "radial-gradient(circle at 78% 18%, rgba(157,231,214,0.28), transparent 30%), linear-gradient(135deg, #170c2a 0%, #2a104d 52%, #4f297f 100%)",
          color: "white",
          display: "flex",
          fontFamily: "Segoe UI, Arial, sans-serif",
          height: "100%",
          padding: 64,
          position: "relative",
          width: "100%",
        }}
      >
        <div
          style={{
            border: "1px solid rgba(255,255,255,0.16)",
            borderRadius: 42,
            boxShadow: "0 30px 80px rgba(8,5,18,0.34)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            overflow: "hidden",
            padding: 48,
            width: "100%",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div
              style={{
                background: "rgba(255,255,255,0.12)",
                border: "1px solid rgba(255,255,255,0.18)",
                borderRadius: 999,
                display: "flex",
                fontSize: 28,
                fontWeight: 700,
                padding: "16px 24px",
              }}
            >
              Ingeniometrix
            </div>
            <div
              style={{
                background: "white",
                borderRadius: 999,
                color: "#34145f",
                display: "flex",
                fontSize: 22,
                fontWeight: 800,
                padding: "16px 22px",
              }}
            >
              Acceso temprano
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 22, maxWidth: 850 }}>
            <div
              style={{
                color: "rgba(255,255,255,0.66)",
                display: "flex",
                fontSize: 24,
                fontWeight: 700,
                letterSpacing: 5,
                textTransform: "uppercase",
              }}
            >
              Snapshot de investigación
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 82,
                fontWeight: 780,
                letterSpacing: -3.2,
                lineHeight: 0.98,
              }}
            >
              Aterriza tu tema antes de avanzar.
            </div>
          </div>

          <div style={{ display: "flex", gap: 14 }}>
            {["Síntesis", "Ejes clave", "Poster visual"].map((item) => (
              <div
                key={item}
                style={{
                  background: "rgba(255,255,255,0.12)",
                  border: "1px solid rgba(255,255,255,0.16)",
                  borderRadius: 999,
                  display: "flex",
                  fontSize: 24,
                  fontWeight: 700,
                  padding: "14px 20px",
                }}
              >
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
