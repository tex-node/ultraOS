#!/bin/bash
# What state did the last local e2e run leave the prepared fixture in?
set -uo pipefail
docker exec ultraos-e2e-postgres psql -U ultraos -d ultraleagueos_test -Atc "
select 'fixture ' || f.id || ' · status ' || f.status || ' · game ' || coalesce(g.id, 'NONE') || ' · game status ' || coalesce(g.status, 'NONE')
from \"Fixture\" f left join \"Game\" g on g.\"fixtureId\" = f.id
where f.\"organizationId\" = (select id from \"Organization\" where slug = 'e2e-league')
order by f.\"scheduledAt\" desc limit 5"
