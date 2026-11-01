-- Read-only image fingerprints for files already referenced by a visible house.
-- Existing row-level policies remain in force for both properties and storage.
create or replace function public.house_hunt_photo_fingerprints()
returns table(path text, fingerprint text)
language sql stable security invoker set search_path = ''
as $$
 select distinct o.name,
   'etag:' || lower(trim(both '"' from o.metadata->>'eTag')) || ':' || (o.metadata->>'size')
 from public.properties p
 cross join lateral pg_catalog.jsonb_array_elements(coalesce(p.images, '[]'::jsonb)) item(value)
 join storage.objects o on o.bucket_id = 'property-photos' and o.name = item.value->>'path'
 where o.metadata->>'eTag' ~ '^"?[0-9a-f]{32}"?$'
   and o.metadata->>'size' ~ '^[0-9]+$'
$$;
revoke all on function public.house_hunt_photo_fingerprints() from public, anon, authenticated;
grant execute on function public.house_hunt_photo_fingerprints() to authenticated;
