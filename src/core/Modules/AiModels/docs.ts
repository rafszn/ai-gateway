/**
 * @openapi
 * /models:
 *   get:
 *     operationId: listModels
 *     summary: List models available to the API key
 *     description: >
 *       Returns Codex model catalog entries for deployments assigned to the
 *       authenticated gateway API key. Catalog slugs are returned as Foundry
 *       deployment names ending in -1. The api-version and client_version
 *       query parameters are accepted for client compatibility.
 *     tags:
 *       - Models
 *     security:
 *       - apiKeyAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: api-version
 *         required: false
 *         schema:
 *           type: string
 *       - in: query
 *         name: client_version
 *         required: false
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Codex model catalog entries assigned to this key.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - models
 *               properties:
 *                 models:
 *                   type: array
 *                   items:
 *                     type: object
 *                     required:
 *                       - slug
 *                       - display_name
 *                       - supported_in_api
 *                     properties:
 *                       slug:
 *                         type: string
 *                         example: gpt-6-luna-1
 *                       display_name:
 *                         type: string
 *                       supported_in_api:
 *                         type: boolean
 *                     additionalProperties: true
 *       401:
 *         description: Missing, invalid, expired, or revoked gateway key.
 *       429:
 *         description: Too many requests from this IP.
 */
export {};
