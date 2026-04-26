import "@testing-library/jest-dom";

// jsdom's File/Blob may lack arrayBuffer; use FileReader like older browsers.
if (typeof File !== "undefined" && typeof FileReader !== "undefined" && typeof File.prototype.arrayBuffer !== "function") {
  File.prototype.arrayBuffer = function arrayBuffer(this: File) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as ArrayBuffer);
      r.onerror = () => reject(r.error);
      r.readAsArrayBuffer(this);
    });
  };
}
if (typeof File !== "undefined" && typeof File.prototype.text !== "function") {
  File.prototype.text = function text(this: File) {
    return this.arrayBuffer().then((b) => new TextDecoder("utf-8").decode(b));
  };
}

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
