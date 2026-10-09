-- Développement uniquement : rôle applicatif soumis à la RLS (ni superutilisateur, ni BYPASSRLS).
-- Les migrations s'exécutent avec le rôle propriétaire `consulpro`.
CREATE ROLE consulpro_app LOGIN PASSWORD 'consulpro_app' NOSUPERUSER NOBYPASSRLS;
