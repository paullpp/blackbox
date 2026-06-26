import type {
  ConsoleLevel,
  SerializedArg,
  StackFrame,
} from "@shared/format";

/** A subset of CDP Runtime.RemoteObject. */
export interface RemoteObject {
  type: string;
  subtype?: string;
  className?: string;
  value?: unknown;
  unserializableValue?: string;
  description?: string;
  preview?: { description?: string };
}

/** A subset of CDP Runtime.StackTrace. */
export interface CdpStackTrace {
  callFrames?: Array<{
    functionName?: string;
    url?: string;
    lineNumber?: number;
    columnNumber?: number;
  }>;
}

/** Map a CDP console API type to our console level. */
export function consoleApiTypeToLevel(type: string): ConsoleLevel {
  switch (type) {
    case "error":
    case "assert":
      return "error";
    case "warning":
      return "warn";
    case "debug":
      return "debug";
    case "info":
      return "info";
    default:
      return "log";
  }
}

/** Map a CDP Log.LogEntry level to our console level. */
export function logEntryLevelToLevel(level: string): ConsoleLevel {
  switch (level) {
    case "error":
      return "error";
    case "warning":
      return "warn";
    case "verbose":
      return "debug";
    default:
      return "info";
  }
}

/** Serialize a single CDP RemoteObject into a transportable arg. */
export function serializeRemoteObject(o: RemoteObject): SerializedArg {
  if (o.unserializableValue !== undefined) {
    return { __type: o.type, preview: o.unserializableValue };
  }
  switch (o.type) {
    case "string":
      return String(o.value ?? o.description ?? "");
    case "number":
      return typeof o.value === "number" ? o.value : Number(o.description ?? 0);
    case "boolean":
      return Boolean(o.value);
    case "undefined":
      return { __type: "undefined", preview: "undefined" };
    case "function":
      return { __type: "function", preview: o.description || "ƒ" };
    case "symbol":
      return { __type: "symbol", preview: o.description || "Symbol()" };
    case "object": {
      if (o.subtype === "null") return null;
      const preview =
        o.preview?.description ||
        o.description ||
        (o.className ? `[${o.className}]` : "[object]");
      return { __type: o.subtype || o.className || "object", preview };
    }
    default:
      return {
        __type: o.type,
        preview: o.description ?? String(o.value ?? ""),
      };
  }
}

/** Build a flat, single-line human-readable string from serialized args. */
export function flattenArgs(args: SerializedArg[]): string {
  return args
    .map((a) => {
      if (a === null) return "null";
      if (typeof a === "object") return a.preview;
      return String(a);
    })
    .join(" ");
}

export function convertStackTrace(
  st: CdpStackTrace | undefined,
): StackFrame[] | undefined {
  if (!st?.callFrames?.length) return undefined;
  return st.callFrames.map((f) => ({
    fn: f.functionName || "(anonymous)",
    url: f.url || "",
    line: (f.lineNumber ?? 0) + 1,
    col: (f.columnNumber ?? 0) + 1,
  }));
}
