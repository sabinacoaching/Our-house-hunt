-- Add the new workflow choices without rewriting the owner's stored statuses.
-- Retired values remain allowed for saved records, undo and older open tabs.
ALTER TABLE public.properties
  DROP CONSTRAINT properties_status_check,
  ADD CONSTRAINT properties_status_check CHECK (status IN (
    '', 'interested', 'enquire_viewing', 'requested_viewing', 'viewing_booked',
    'viewed', 'only_wo', 'under_offer', 'archived', 'deleted',
    'shortlisted', 'rejected', 'under_offer_sold'
  ));
