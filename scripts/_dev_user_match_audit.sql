SELECT u.id, u.name, u.email, array_agg(ur."roleId") AS role_ids
FROM "User" u
LEFT JOIN "UserRole" ur ON ur."userId" = u.id
GROUP BY u.id, u.name, u.email
ORDER BY u.name;
