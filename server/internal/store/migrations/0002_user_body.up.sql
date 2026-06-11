-- Optional body details for the daily-energy estimate (BMR needs them).
-- All nullable by design: the feature unlocks when the user chooses to add
-- them, never required for training.
ALTER TABLE users
    ADD COLUMN height_cm   int,
    ADD COLUMN birth_year  int,
    ADD COLUMN sex         text CHECK (sex IN ('male', 'female'));
