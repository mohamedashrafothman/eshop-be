export * from "./server";

const isEmpty = (obj: any) => [Object, Array].includes((obj || {}).constructor) && !Object.entries(obj || {}).length;

export { isEmpty };
