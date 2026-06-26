import { useRef, useState } from "react";
import { FilmIcon } from "./icons";

interface Props {
  onFile: (file: File) => void;
  error?: string | null;
  loading?: boolean;
}

export function Dropzone({ onFile, error, loading }: Props) {
  const [hover, setHover] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (files: FileList | null) => {
    const f = files?.[0];
    if (f) onFile(f);
  };

  return (
    <div
      className={`dropzone ${hover ? "hover" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setHover(true);
      }}
      onDragLeave={() => setHover(false)}
      onDrop={(e) => {
        e.preventDefault();
        setHover(false);
        handleFiles(e.dataTransfer.files);
      }}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".zip,application/zip"
        hidden
        onChange={(e) => handleFiles(e.target.files)}
      />
      <div className="dropzone-inner">
        <div className="dropzone-icon"><FilmIcon size={40} /></div>
        <h2>Blackbox</h2>
        {loading ? (
          <p>Reading recording…</p>
        ) : (
          <p>Drag a <code>recording-*.zip</code> here, or click to choose.</p>
        )}
        {error && <p className="dz-error">{error}</p>}
      </div>
    </div>
  );
}
