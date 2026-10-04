import { useState } from "react"

const examples = [
  { id: "arduino-uno", title: "Arduino Uno fixture" },
  { id: "usb-c-pcb", title: "USB-C PCB" },
  { id: "soic8", title: "SOIC-8 package" },
  { id: "usb-enclosure", title: "USB enclosure" },
]

const images = import.meta.glob(
  "../../tests/fixtures/realistic-examples/*-{realistic,default}.png",
  { eager: true, query: "?url", import: "default" },
) as Record<string, string>

export default function RealisticGallery() {
  const [realistic, setRealistic] = useState(true)
  const mode = realistic ? "realistic" : "default"
  return (
    <main
      style={{
        maxWidth: 1280,
        margin: "0 auto",
        padding: 24,
        fontFamily: "system-ui, sans-serif",
        color: "#18212d",
      }}
    >
      <h1>Realistic rendering gallery</h1>
      <p>
        Existing repository models rendered with the same camera, materials, and
        studio floor in both modes. These are pre-rendered images.
      </p>
      <label style={{ display: "block", marginBottom: 24 }}>
        <input
          type="checkbox"
          checked={realistic}
          onChange={(event) => setRealistic(event.target.checked)}
        />{" "}
        Realistic lighting
      </label>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 24,
        }}
      >
        {examples.map(({ id, title }) => (
          <figure key={id} style={{ margin: 0 }}>
            <img
              src={
                images[
                  `../../tests/fixtures/realistic-examples/${id}-${mode}.png`
                ]
              }
              alt={`${title}, ${mode} rendering`}
              width={600}
              height={600}
              style={{ width: "100%", height: "auto", borderRadius: 8 }}
            />
            <figcaption style={{ marginTop: 8 }}>{title}</figcaption>
          </figure>
        ))}
      </div>
      <p style={{ marginTop: 24 }}>
        The SOIC-8 fixture uses authored plastic and steel materials. The other
        models retain their original materials. Regenerate with{" "}
        <code>bun scripts/realistic-examples.ts</code>.
      </p>
    </main>
  )
}
