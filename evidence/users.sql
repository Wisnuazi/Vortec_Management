SELECT u.email,
       u.username,
       u.name,
       u."isSuperAdmin",
       u."createdAt",
       COALESCE(string_agg(r.title, ', ' ORDER BY r.title), '') AS roles
FROM "User" u
LEFT JOIN "UserRole" ur ON ur."userId" = u.id
LEFT JOIN "Role" r ON r.id = ur."roleId"
GROUP BY u.id, u.email, u.username, u.name, u."isSuperAdmin", u."createdAt"
ORDER BY u."isSuperAdmin" DESC, u.name;
