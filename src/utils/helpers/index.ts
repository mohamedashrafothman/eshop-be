export * from "./server";

const isEmpty = (obj: any) =>
	[Object, Array].includes((obj || {}).constructor) && !Object.entries(obj || {}).length;

const groupBy = <T extends Record<string, any>>(
	objArray: T[],
	prop: keyof T
): { [key: string]: T[] } => {
	return objArray.reduce(
		(acc, obj) => {
			const key = obj[prop] as string; // Explicitly type key as string
			if (!acc[key]) acc[key] = [];
			acc[key].push(obj);
			return acc;
		},
		{} as { [key: string]: T[] }
	);
};

const isFunction = (value: any): boolean => typeof value === "function";

export { groupBy, isEmpty, isFunction };
