select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_name in ('GameVideo', 'VisionAnalysisRun', 'VisionModel', 'MediaAsset')
  and is_nullable = 'NO'
  and column_default is null
order by table_name, ordinal_position;
