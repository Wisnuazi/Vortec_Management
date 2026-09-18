SELECT u.name, r.title AS role_title
FROM "User" u
JOIN "UserRole" ur ON ur."userId" = u.id
JOIN "Role" r ON r.id = ur."roleId"
WHERE u.name = 'Angga'
ORDER BY r.title;
