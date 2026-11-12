select f.id as fixture_id,
       f.status as fixture_status,
       coalesce(g.id, 'NONE') as game_id,
       coalesce(g.status::text, 'NONE') as game_status
from "Fixture" f
left join "Game" g on g."fixtureId" = f.id
where f."organizationId" = (select id from "Organization" where slug = 'e2e-league')
order by f."scheduledAt" desc
limit 6;
