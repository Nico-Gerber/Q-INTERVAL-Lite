import { useState } from "react";


function Tooltip({ text }) {
  const [visible, setVisible] = useState(false);

  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <button
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        style={{
          width: 18,
          height: 18,
          borderRadius: "50%",
          border: "1.5px solid #6b7280",
          background: "transparent",
          color: "#6b7280",
          fontSize: 11,
          fontWeight: "bold",
          cursor: "default",
          lineHeight: 1,
          padding: 0,
        }}
        aria-label="More info"
      >
        ?
      </button>

      {visible && (
        <span style={{
          position: "absolute",
          left: "50%",
          bottom: "calc(100% + 8px)",
          transform: "translateX(-50%)",
          background: "#1f2937",
          color: "#f9fafb",
          padding: "8px 12px",
          borderRadius: 6,
          fontSize: 13,
          whiteSpace: "normal",
          width: 220,
          maxWidth: 220,
          zIndex: 10,
          pointerEvents: "none",
          lineHeight: 1.4,
          boxSizing: "border-box",
        }}>
          {text}
        </span>
      )}
    </span>
  );
}

export default Tooltip;