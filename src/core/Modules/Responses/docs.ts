/**
 * @openapi
 * /responses:
 *   post:
 *     operationId: createResponse
 *     summary: Create a model response
 *     description: >
 *       Proxies an OpenAI Responses API request to the configured Azure OpenAI
 *       v1 endpoint. The api-version query parameter is accepted for client
 *       compatibility but is not forwarded upstream.
 *     tags:
 *       - Responses
 *     security:
 *       - apiKeyAuth: []
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: api-version
 *         required: false
 *         schema:
 *           type: string
 *         description: Accepted for client compatibility and ignored upstream.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - model
 *             properties:
 *               model:
 *                 type: string
 *                 description: Foundry deployment name allowed by the API key.
 *                 example: gpt-6-luna-1
 *               input:
 *                 oneOf:
 *                   - type: string
 *                   - type: array
 *                     items:
 *                       type: object
 *                 description: Responses API input.
 *               stream:
 *                 type: boolean
 *                 default: false
 *               max_output_tokens:
 *                 type: integer
 *                 nullable: true
 *             additionalProperties: true
 *     responses:
 *       200:
 *         description: A response body or a streamed Server Sent Events response.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *           text/event-stream:
 *             schema:
 *               type: string
 *       400:
 *         description: Invalid request or model is not allowed for the key.
 *       401:
 *         description: Missing, invalid, expired, or revoked gateway key.
 *       413:
 *         description: Request exceeds the configured token ceiling.
 *       429:
 *         description: A key quota is exhausted. Includes Retry-After.
 *       502:
 *         description: The Foundry request failed.
 *       503:
 *         description: The gateway could not reserve quota or prepare the request.
 */
export {};
