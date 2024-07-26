const AddressesController = {
	validator: (method: string) => {
		switch (method) {
			case "create":
			case "update":
				return [];
			default:
				return [];
		}
	},
	getAddressesList: () => {},
	getSingleAddress: () => {},
	createSingleAddress: () => {},
	updateSingleAddress: () => {},
	deleteSingleAddress: () => {},
};

export default AddressesController;
