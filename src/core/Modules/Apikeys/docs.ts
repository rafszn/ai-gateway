/**
 * @openapi
 * /members/{memberId}/keys:
 *   get:
 *     summary: List a member's API keys
 *     tags:
 *       - API Keys
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: memberId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 25
 *     responses:
 *       200:
 *         description: Paginated key metadata. Secret values and hashes are never returned.
 *       401:
 *         description: Missing, invalid, or expired admin token
 *       403:
 *         description: Caller lacks key, model, or limit read permission
 *       404:
 *         description: Member not found
 *
 *   post:
 *     summary: Create an API key for a member
 *     description: The secret is returned only in this response. Create a replacement key if it is lost.
 *     tags:
 *       - API Keys
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: memberId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - models
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 80
 *                 description: Optional name. A unique name is generated when omitted.
 *               models:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: string
 *                   pattern: '^gpt-[a-z0-9]+(?:[.-][a-z0-9]+)*-1$'
 *                   example: gpt-6-luna-1
 *               tier:
 *                 type: string
 *                 enum: [1B, 600M, 300M]
 *                 default: 300M
 *               limits:
 *                 type: object
 *                 description: Optional per key overrides for the selected tier.
 *                 properties:
 *                   tokensPerMinute:
 *                     type: integer
 *                     minimum: 1
 *                   dailyTokens:
 *                     type: integer
 *                     minimum: 1
 *                   weeklyTokens:
 *                     type: integer
 *                     minimum: 1
 *                   monthlyTokens:
 *                     type: integer
 *                     minimum: 1
 *     responses:
 *       201:
 *         description: Key created. Copy the secret because it will not be shown again.
 *       400:
 *         description: Invalid request body or model identifier
 *       401:
 *         description: Missing, invalid, or expired admin token
 *       403:
 *         description: Caller lacks key create, model update, or limit update permission
 *       404:
 *         description: Member not found
 *       409:
 *         description: A key with this name already exists for the member
 *
 * /members/{memberId}/keys/{keyId}/name:
 *   patch:
 *     summary: Rename an API key
 *     tags:
 *       - API Keys
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: memberId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: keyId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 80
 *     responses:
 *       200:
 *         description: Key name updated
 *       401:
 *         description: Missing, invalid, or expired admin token
 *       403:
 *         description: Caller lacks key update permission
 *       404:
 *         description: Member or key not found
 *       409:
 *         description: Key is revoked or the name is already in use
 *
 * /members/{memberId}/keys/{keyId}/models:
 *   patch:
 *     summary: Replace the models allowed for an API key
 *     tags:
 *       - API Keys
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: memberId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: keyId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [models]
 *             properties:
 *               models:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: string
 *                   pattern: '^gpt-[a-z0-9]+(?:[.-][a-z0-9]+)*-1$'
 *     responses:
 *       200:
 *         description: Allowed models replaced
 *       400:
 *         description: Invalid model identifier
 *       401:
 *         description: Missing, invalid, or expired admin token
 *       403:
 *         description: Caller lacks model update permission
 *       404:
 *         description: Member or key not found
 *       409:
 *         description: Key is revoked
 *
 * /members/{memberId}/keys/{keyId}/limits:
 *   patch:
 *     summary: Update one or more limits for an API key
 *     tags:
 *       - API Keys
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: memberId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: keyId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             minProperties: 1
 *             properties:
 *               tokensPerMinute:
 *                 type: integer
 *                 minimum: 1
 *               dailyTokens:
 *                 type: integer
 *                 minimum: 1
 *               weeklyTokens:
 *                 type: integer
 *                 minimum: 1
 *               monthlyTokens:
 *                 type: integer
 *                 minimum: 1
 *     responses:
 *       200:
 *         description: Key limits updated
 *       400:
 *         description: Invalid limit
 *       401:
 *         description: Missing, invalid, or expired admin token
 *       403:
 *         description: Caller lacks limit update permission
 *       404:
 *         description: Member or key not found
 *       409:
 *         description: Key is revoked
 *
 * /members/{memberId}/keys/{keyId}/revoke:
 *   post:
 *     summary: Revoke an API key
 *     tags:
 *       - API Keys
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: memberId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: keyId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Key revoked. Revoke is idempotent.
 *       401:
 *         description: Missing, invalid, or expired admin token
 *       403:
 *         description: Caller lacks key revoke permission
 *       404:
 *         description: Member or key not found
 *
 * /members/{memberId}/keys/{keyId}/reactivate:
 *   post:
 *     summary: Reactivate an expired API key
 *     description: Only an expired key can be reactivated. Quota counters are unchanged.
 *     tags:
 *       - API Keys
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: memberId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: keyId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Key reactivated for 30 days
 *       401:
 *         description: Missing, invalid, or expired admin token
 *       403:
 *         description: Caller lacks key update permission
 *       404:
 *         description: Member or key not found
 *       409:
 *         description: Key has not expired or has been revoked
 *
 * /members/{memberId}/keys/{keyId}:
 *   delete:
 *     summary: Delete an API key record
 *     description: Only a SUPER_ADMIN has the key delete permission.
 *     tags:
 *       - API Keys
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: memberId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: keyId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Key record deleted
 *       401:
 *         description: Missing, invalid, or expired admin token
 *       403:
 *         description: Caller lacks key delete permission
 *       404:
 *         description: Member or key not found
 */
