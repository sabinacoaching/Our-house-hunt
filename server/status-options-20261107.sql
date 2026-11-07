-- Add the two viewing statuses while preserving previously stored values.
ALTER TABLE public.properties
  DROP CONSTRAINT properties_status_check,
  ADD CONSTRAINT properties_status_check CHECK (status IN (
    '', 'interested', 'requested_viewing', 'viewing_booked', 'viewed',
    'shortlisted', 'only_wo', 'rejected', 'under_offer_sold', 'archived', 'deleted'
  ));
