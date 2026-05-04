import { ImageResponse } from "next/og";

export const alt = "Ingeniometrix";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "stretch",
          background:
            "linear-gradient(135deg, #fffaf4 0%, #f7f0ff 48%, #effbf8 100%)",
          color: "#17131f",
          display: "flex",
          fontFamily: "Segoe UI, Arial, sans-serif",
          height: "100%",
          justifyContent: "space-between",
          padding: 64,
          position: "relative",
          width: "100%",
        }}
      >
        <div
          style={{
            background: "rgba(219,193,255,0.58)",
            borderRadius: "999px",
            filter: "blur(18px)",
            height: 260,
            left: -70,
            position: "absolute",
            top: -90,
            width: 260,
          }}
        />
        <div
          style={{
            background: "rgba(157,231,214,0.5)",
            borderRadius: "999px",
            bottom: -80,
            filter: "blur(18px)",
            height: 300,
            position: "absolute",
            right: -70,
            width: 300,
          }}
        />

        <div
          style={{
            border: "1px solid rgba(74,58,97,0.12)",
            borderRadius: 42,
            boxShadow: "0 30px 80px rgba(41,22,67,0.16)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            overflow: "hidden",
            padding: 48,
            position: "relative",
            width: "100%",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div
              style={{
                background: "#34145f",
                borderRadius: 999,
                color: "white",
                display: "flex",
                fontSize: 28,
                fontWeight: 700,
                letterSpacing: -0.4,
                padding: "16px 24px",
              }}
            >
              Ingeniometrix
            </div>
            <div
              style={{
                border: "1px solid rgba(74,58,97,0.12)",
                borderRadius: 999,
                color: "#645e73",
                display: "flex",
                fontSize: 22,
                fontWeight: 700,
                padding: "16px 22px",
              }}
            >
              IngenioIA
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 22, maxWidth: 820 }}>
            <div
              style={{
                color: "#645e73",
                display: "flex",
                fontSize: 24,
                fontWeight: 700,
                letterSpacing: 5,
                textTransform: "uppercase",
              }}
            >
              Investigación académica con más claridad
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 74,
                fontWeight: 750,
                letterSpacing: -2.8,
                lineHeight: 1.02,
              }}
            >
              Convierte una idea difusa en una base trazable.
            </div>
          </div>

          <div style={{ display: "flex", gap: 14 }}>
            {["Tema refinado", "Ejes clave", "Plan inicial"].map((item) => (
              <div
                key={item}
                style={{
                  background: "rgba(255,255,255,0.78)",
                  border: "1px solid rgba(74,58,97,0.1)",
                  borderRadius: 999,
                  color: "#34145f",
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
