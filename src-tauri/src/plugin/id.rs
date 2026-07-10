pub fn is_lensx_id(id: &str) -> bool {
  let parts: Vec<&str> = id.split('.').collect();
  if parts.len() != 3 {
    return false;
  }

  parts.iter().all(|part| {
    let mut chars = part.chars();
    matches!(chars.next(), Some(first) if first.is_ascii_lowercase())
      && chars.all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || ch == '_' || ch == '-')
  })
}

pub fn validate_lensx_id(id: &str, label: &str) -> Result<(), String> {
  if is_lensx_id(id) {
    Ok(())
  } else {
    Err(format!(
      "{label} \"{id}\" must be a strict three-part ID: author.module.name"
    ))
  }
}

#[cfg(test)]
mod tests {
  use super::is_lensx_id;

  #[test]
  fn accepts_three_part_ids_with_suffix_in_third_part() {
    assert!(is_lensx_id("lensx.core.settings"));
    assert!(is_lensx_id("lensx.core.settings_page_main"));
  }

  #[test]
  fn rejects_nested_or_invalid_ids() {
    assert!(!is_lensx_id("lensx.core.settings.page.main"));
    assert!(!is_lensx_id("Lensx.core.settings"));
    assert!(!is_lensx_id("lensx..settings"));
  }
}
