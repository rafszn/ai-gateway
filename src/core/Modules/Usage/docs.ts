/**
 * @openapi
 * /usage:
 *   get:
 *     summary: View usage for a named API key
 *     description: Public endpoint. Anyone who knows the key name can view its limits and usage. No member identity or API secret is returned.
 *     tags:
 *       - Usage
 *     security: []
 *     parameters:
 *       - in: query
 *         name: keyName
 *         required: true
 *         schema:
 *           type: string
 *           minLength: 1
 *           maxLength: 80
 *         description: API key name. Must identify exactly one key across the platform.
 *     responses:
 *       200:
 *         description: Current quota windows and current UTC month usage summary
 *       400:
 *         description: Missing or invalid keyName
 *       404:
 *         description: No API key has this name
 *       409:
 *         description: The name matches multiple API keys
 *       429:
 *         description: Public IP rate limit exceeded
 */
