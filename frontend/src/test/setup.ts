import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => cleanup());

// jsdom 25 reflects the <dialog open> attribute but implements none of the
// methods. The component uses the native modal (focus trap, Esc and focus restore
// come free in a real browser), so the environment gets the missing three.
const dialog = HTMLDialogElement.prototype as HTMLDialogElement & {
  showModal?: () => void;
};
if (!dialog.showModal) {
  dialog.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  dialog.show = function show(this: HTMLDialogElement) {
    this.open = true;
  };
  dialog.close = function close(this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
}

// This jsdom does not implement Blob.prototype.text(), which the batch dialog uses
// to read picked files. FileReader IS implemented, so back it with that rather than
// degrading the component to a legacy API.
if (!Blob.prototype.text) {
  Blob.prototype.text = function text(this: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(this);
    });
  };
}

// jsdom has no blob URL store. Plain assignment keeps these spy-able.
if (!URL.createObjectURL) {
  let counter = 0;
  URL.createObjectURL = () => `blob:test/${++counter}`;
  URL.revokeObjectURL = () => undefined;
}
