/**
 * @openapi
 * /admin/auth/login:
 *   post:
 *     summary: Log in as an administrator
 *     tags:
 *       - Admin
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: Administrator authenticated
 *       400:
 *         description: Invalid request body
 *       401:
 *         description: Invalid credentials
 *
 * /admin/auth/me:
 *   get:
 *     summary: Get the current administrator
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current administrator
 *       401:
 *         description: Missing, invalid, or expired token
 *
 * /admin:
 *   post:
 *     summary: Create an ADMIN account
 *     description: Only a SUPER_ADMIN may create an ADMIN account.
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *                 format: password
 *     responses:
 *       201:
 *         description: Administrator created
 *       400:
 *         description: Invalid request body
 *       401:
 *         description: Missing, invalid, or expired token
 *       403:
 *         description: Caller lacks permission
 *       409:
 *         description: Username already exists
 */
