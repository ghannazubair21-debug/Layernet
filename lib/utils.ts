/* eslint-disable @typescript-eslint/no-explicit-any */

export type ClassValue =
  | string
  | number
  | false
  | null
  | undefined
  | ((...args: any[]) => string | undefined)
  | ClassValue[];

export function cn(...classes: ClassValue[]): string {
  const res: string[] = [];

  function normalize(val: ClassValue) {
    if (val === false || val === null || val === undefined) return;
    if (typeof val === "string" || typeof val === "number") {
      res.push(String(val));
      return;
    }
    if (typeof val === "function") {
      // call without args; shadcn patterns sometimes pass a state arg, but the
      // function may accept a typed state parameter. Calling with undefined is
      // safe for most style helper functions which handle undefined.
      const v = (val as (...args: any[]) => string | undefined)();
      if (v) normalize(v as ClassValue);
      return;
    }
    if (Array.isArray(val)) {
      val.forEach(normalize);
    }
  }

  classes.forEach(normalize);
  return res.join(" ");
}
