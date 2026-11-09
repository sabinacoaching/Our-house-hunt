-- Save a complete Google Maps calculation only if no field of the house has
-- changed since it was read. RLS applies as for any other household update.
create or replace function public.house_hunt_save_google_routes(p_id uuid, p_before jsonb, p_patch jsonb)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare changed uuid; k text;
begin
 if p_before->>'id' is distinct from p_id::text or jsonb_typeof(p_patch) <> 'object'
    or p_patch->>'latitude' is null or p_patch->>'longitude' is null
    or jsonb_typeof(p_patch->'station_commutes') <> 'object'
    or jsonb_typeof(p_patch->'journey_estimates') <> 'object'
    or jsonb_typeof(p_patch->'import_diagnostics') <> 'object'
    or (p_patch->'station_commutes'->'google_verified') is distinct from coalesce(p_before->'station_commutes'->'google_verified','{}'::jsonb)
 then raise exception 'Invalid route update'; end if;
 if exists(select 1 from jsonb_object_keys(p_patch) key where key not in ('latitude','longitude','import_diagnostics','station_commutes','journey_estimates','station_name','station_2_name','station_3_name','station_distance_miles','station_2_distance_miles','station_3_distance_miles')) then raise exception 'Unexpected route field'; end if;
 for k in select unnest(array['latitude','longitude','station_name','station_2_name','station_3_name','station_distance_miles','station_2_distance_miles','station_3_distance_miles']) loop
  if coalesce((p_before->'manual_overrides'->>k)::boolean,false) and p_patch ? k and p_patch->k is distinct from p_before->k then raise exception 'Manual value cannot be overwritten'; end if;
 end loop;
 for k in select unnest(array['waterloo','dilly','dancelab']) loop
  if (p_before->'journey_estimates'->k->>'manual_override'='true' or p_before->'journey_estimates'->k->>'source'='manual') and p_patch->'journey_estimates'->k is distinct from p_before->'journey_estimates'->k then raise exception 'Manual journey cannot be overwritten'; end if;
 end loop;
 update public.properties p set latitude=(p_patch->>'latitude')::double precision,longitude=(p_patch->>'longitude')::double precision,
  station_name=case when p_patch?'station_name' then p_patch->>'station_name' else p.station_name end,
  station_2_name=case when p_patch?'station_2_name' then p_patch->>'station_2_name' else p.station_2_name end,
  station_3_name=case when p_patch?'station_3_name' then p_patch->>'station_3_name' else p.station_3_name end,
  station_distance_miles=case when p_patch?'station_distance_miles' then (p_patch->>'station_distance_miles')::numeric else p.station_distance_miles end,
  station_2_distance_miles=case when p_patch?'station_2_distance_miles' then (p_patch->>'station_2_distance_miles')::numeric else p.station_2_distance_miles end,
  station_3_distance_miles=case when p_patch?'station_3_distance_miles' then (p_patch->>'station_3_distance_miles')::numeric else p.station_3_distance_miles end,
  import_diagnostics=p_patch->'import_diagnostics',station_commutes=p_patch->'station_commutes',journey_estimates=p_patch->'journey_estimates'
 where p.id=p_id and to_jsonb(p)=p_before returning p.id into changed;
 return changed is not null;
end $$;
revoke all on function public.house_hunt_save_google_routes(uuid,jsonb,jsonb) from public, anon;
grant execute on function public.house_hunt_save_google_routes(uuid,jsonb,jsonb) to authenticated;
