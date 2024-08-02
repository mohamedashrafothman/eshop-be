export const validator = (method: string) => {
	switch (method) {
		case "create":
		case "update":
			return [];
		default:
			return [];
	}
};
export const getAddressesList = () => {};
export const getSingleAddress = () => {};
export const createSingleAddress = () => {};
export const updateSingleAddress = () => {};
export const deleteSingleAddress = () => {};
