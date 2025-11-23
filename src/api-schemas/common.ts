/**
 * @openapi
 * components:
 *   schemas:
 *     Error:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *           description: Error name
 *           example: ValidationError
 *         message:
 *           type: string
 *           description: Error message
 *           example: Validation failed
 *         stack:
 *           type: string
 *           description: Error stack trace (only in development)
 *
 *     Flash:
 *       type: object
 *       additionalProperties:
 *         type: array
 *         items:
 *           type: string
 *       example:
 *         success: ["Operation completed successfully"]
 *         error: ["An error occurred"]
 *
 *     SuccessResponse:
 *       type: object
 *       required:
 *         - success
 *         - status
 *         - entities
 *       properties:
 *         success:
 *           type: boolean
 *           example: true
 *         status:
 *           type: integer
 *           description: HTTP status code
 *           example: 200
 *         entities:
 *           type: object
 *           properties:
 *             data:
 *               type: object
 *               description: Response data
 *             stats:
 *               type: object
 *               description: Optional statistics
 *             meta:
 *               $ref: '#/components/schemas/Meta'
 *         flashes:
 *           $ref: '#/components/schemas/Flash'
 *         message:
 *           type: string
 *           description: Optional message
 *         redirectURL:
 *           type: string
 *           description: Optional redirect URL
 *
 *     ErrorResponse:
 *       type: object
 *       required:
 *         - success
 *         - status
 *         - error
 *       properties:
 *         success:
 *           type: boolean
 *           example: false
 *         status:
 *           type: integer
 *           description: HTTP status code
 *           example: 400
 *         error:
 *           $ref: '#/components/schemas/Error'
 *         flashes:
 *           $ref: '#/components/schemas/Flash'
 *         message:
 *           type: string
 *           description: Optional error message
 *
 *     Pagination:
 *       type: object
 *       properties:
 *         page:
 *           type: integer
 *           description: Current page number
 *           example: 1
 *         limit:
 *           type: integer
 *           description: Number of items per page
 *           example: 10
 *         totalDocs:
 *           type: integer
 *           description: Total number of documents
 *           example: 100
 *         totalPages:
 *           type: integer
 *           description: Total number of pages
 *           example: 10
 *         hasNextPage:
 *           type: boolean
 *           description: Whether there is a next page
 *           example: true
 *         hasPrevPage:
 *           type: boolean
 *           description: Whether there is a previous page
 *           example: false
 *         nextPage:
 *           type: integer
 *           nullable: true
 *           description: Next page number
 *           example: 2
 *         prevPage:
 *           type: integer
 *           nullable: true
 *           description: Previous page number
 *           example: null
 *         pagingCounter:
 *           type: integer
 *           description: The starting index of the results
 *           example: 1
 *
 *     SortOption:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *           description: Display name for the sort option
 *           example: Created Date Ascending
 *         value:
 *           type: object
 *           description: Sort field and direction
 *           additionalProperties:
 *             type: integer
 *             enum: [1, -1]
 *           example:
 *             createdAt: 1
 *
 *     Meta:
 *       type: object
 *       properties:
 *         pagination:
 *           $ref: '#/components/schemas/Pagination'
 *         sort:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/SortOption'
 *
 *     ValidationError:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: false
 *         status:
 *           type: integer
 *           example: 422
 *         error:
 *           type: object
 *           properties:
 *             name:
 *               type: string
 *               example: ValidationError
 *             message:
 *               type: string
 *               example: Validation failed
 *             errors:
 *               type: object
 *               additionalProperties:
 *                 type: string
 *               example:
 *                 email: Email is required
 *                 password: Password must be at least 8 characters
 *
 *     UnauthorizedError:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: false
 *         status:
 *           type: integer
 *           example: 401
 *         error:
 *           type: object
 *           properties:
 *             name:
 *               type: string
 *               example: UnauthorizedError
 *             message:
 *               type: string
 *               example: Authentication required
 *
 *     ForbiddenError:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: false
 *         status:
 *           type: integer
 *           example: 403
 *         error:
 *           type: object
 *           properties:
 *             name:
 *               type: string
 *               example: ForbiddenError
 *             message:
 *               type: string
 *               example: Insufficient permissions
 *
 *     NotFoundError:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *           example: false
 *         status:
 *           type: integer
 *           example: 404
 *         error:
 *           type: object
 *           properties:
 *             name:
 *               type: string
 *               example: NotFoundError
 *             message:
 *               type: string
 *               example: Resource not found
 */

// This file defines common OpenAPI schemas that can be reused across all API endpoints
export {};
