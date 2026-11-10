-- Atomically save a prepared user edit without overwriting a concurrent edit.
-- SECURITY INVOKER retains the same table privileges and household RLS as PATCH.
CREATE OR REPLACE FUNCTION public.house_hunt_save_manual_edit(p_id uuid,p_before jsonb,p_patch jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path TO '' AS $$
DECLARE changed uuid; columns_sql text; values_sql text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 IF p_before->>'id' IS DISTINCT FROM p_id::text OR jsonb_typeof(p_patch) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid manual edit'; END IF;
 IF EXISTS (SELECT 1 FROM jsonb_object_keys(p_patch) AS k(key) WHERE key NOT IN (
  'address','title','url','price','bedrooms','bathrooms','status','viewing_at','property_type','tenure',
  'latitude','longitude','wc_count','floors','floor_area_sqm','garden_area_sqm','garden_description',
  'station_name','station_2_name','station_3_name','station_distance_miles','station_2_distance_miles','station_3_distance_miles',
  'comment_sabina','comment_david','agency_name','agency_email','agency_website','manual_overrides','station_commutes','import_diagnostics'
 )) THEN RAISE EXCEPTION 'Unexpected manual-edit field'; END IF;
 SELECT string_agg(format('%I',key),', ' ORDER BY key),
        string_agg(format('(jsonb_populate_record(NULL::public.properties,$1)).%I',key),', ' ORDER BY key)
 INTO columns_sql,values_sql FROM jsonb_object_keys(p_patch) AS k(key);
 IF columns_sql IS NULL THEN RETURN true; END IF;
 EXECUTE format('UPDATE public.properties AS p SET (%s)=(SELECT %s) WHERE p.id=$2 AND to_jsonb(p)=$3 RETURNING p.id',columns_sql,values_sql)
 INTO changed USING p_patch,p_id,p_before;
 RETURN changed IS NOT NULL;
END $$;
REVOKE ALL ON FUNCTION public.house_hunt_save_manual_edit(uuid,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.house_hunt_save_manual_edit(uuid,jsonb,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
