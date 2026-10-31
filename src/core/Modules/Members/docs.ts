/**
 * @openapi
 * /members:
 *   get:
 *     summary: List team members
 *     tags:
 *       - Members
 *     security:
 *       - bearerAuth: []
 *     parameters:
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
 *         description: Paginated member list
 *       401:
 *         description: Missing, invalid, or expired token
 *       403:
 *         description: Caller lacks permission
 *
 *   post:
 *     summary: Create a team member
 *     tags:
 *       - Members
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
 *               - email
 *             properties:
 *               username:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               firstName:
 *                 type: string
 *                 nullable: true
 *               lastName:
 *                 type: string
 *                 nullable: true
 *               phoneNumber:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       201:
 *         description: Member created
 *       400:
 *         description: Invalid request body
 *       401:
 *         description: Missing, invalid, or expired token
 *       403:
 *         description: Caller lacks permission
 *       409:
 *         description: Username or email already exists
 *
 * /members/{id}:
 *   get:
 *     summary: Get a team member
 *     tags:
 *       - Members
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Member details
 *       401:
 *         description: Missing, invalid, or expired token
 *       403:
 *         description: Caller lacks permission
 *       404:
 *         description: Member not found
 *
 *   patch:
 *     summary: Update a team member
 *     tags:
 *       - Members
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               firstName:
 *                 type: string
 *                 nullable: true
 *               lastName:
 *                 type: string
 *                 nullable: true
 *               phoneNumber:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Member updated
 *       400:
 *         description: Invalid request body
 *       401:
 *         description: Missing, invalid, or expired token
 *       403:
 *         description: Caller lacks permission
 *       404:
 *         description: Member not found
 *       409:
 *         description: Username or email already exists
 *
 *   delete:
 *     summary: Delete a team member
 *     description: Only a SUPER_ADMIN has the member delete permission.
 *     tags:
 *       - Members
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Member deleted
 *       401:
 *         description: Missing, invalid, or expired token
 *       403:
 *         description: Caller lacks permission
 *       404:
 *         description: Member not found
 */
