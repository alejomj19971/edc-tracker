import "./globals.css";

export const metadata = {
  title: "Seguimiento de actividades EDC",
  description: "Seguimiento de actividades del proyecto EDC",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
