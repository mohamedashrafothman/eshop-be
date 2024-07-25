import mongoosePaginate from "mongoose-paginate-v2";

mongoosePaginate.paginate.options = {
	select: "", // {Object | String} - Fields to return (by default returns all fields).
	pagination: true, // {Boolean} - If pagination is set to false, it will return all docs without limit.
	page: 1, // {Number}
	limit: 10, // {Number}
	sort: { createdAt: "desc" }, // {Object | String} - Sort order.
	lean: false, // {Boolean} - Should return plain javascript objects instead of Mongoose documents?
	leanWithId: true, // {Boolean} - If lean and leanWithId are true, adds id with string represent of _id to all docs
};
