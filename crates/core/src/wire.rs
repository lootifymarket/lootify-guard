//! Just enough of the protobuf wire format for the few Steam client messages the
//! app sends and reads.

#[derive(Default)]
pub(crate) struct Writer(Vec<u8>);

impl Writer {
    pub(crate) fn varint(mut self, field: u32, value: u64) -> Self {
        self.key(field, 0);
        put_varint(&mut self.0, value);
        self
    }

    pub(crate) fn fixed64(mut self, field: u32, value: u64) -> Self {
        self.key(field, 1);
        self.0.extend_from_slice(&value.to_le_bytes());
        self
    }

    pub(crate) fn fixed32(mut self, field: u32, value: u32) -> Self {
        self.key(field, 5);
        self.0.extend_from_slice(&value.to_le_bytes());
        self
    }

    pub(crate) fn bytes(mut self, field: u32, value: &[u8]) -> Self {
        self.key(field, 2);
        put_varint(&mut self.0, value.len() as u64);
        self.0.extend_from_slice(value);
        self
    }

    pub(crate) fn string(self, field: u32, value: &str) -> Self {
        self.bytes(field, value.as_bytes())
    }

    pub(crate) fn finish(self) -> Vec<u8> {
        self.0
    }

    fn key(&mut self, field: u32, wire_type: u8) {
        put_varint(&mut self.0, u64::from(field) << 3 | u64::from(wire_type));
    }
}

fn put_varint(out: &mut Vec<u8>, mut value: u64) {
    while value >= 0x80 {
        out.push(value as u8 | 0x80);
        value >>= 7;
    }
    out.push(value as u8);
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Value<'a> {
    Varint(u64),
    Fixed64(u64),
    Bytes(&'a [u8]),
    Fixed32(u32),
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) struct Malformed;

/// A message's fields in the order they came, repeated ones included.
pub(crate) struct Fields<'a>(pub(crate) Vec<(u32, Value<'a>)>);

impl<'a> Fields<'a> {
    pub(crate) fn read(mut data: &'a [u8]) -> Result<Self, Malformed> {
        let mut fields = Vec::new();
        while !data.is_empty() {
            let key = take_varint(&mut data)?;
            let field = u32::try_from(key >> 3).map_err(|_| Malformed)?;
            let value = match key & 7 {
                0 => Value::Varint(take_varint(&mut data)?),
                1 => Value::Fixed64(u64::from_le_bytes(
                    take(&mut data, 8)?.try_into().expect("eight bytes"),
                )),
                2 => {
                    let len = usize::try_from(take_varint(&mut data)?).map_err(|_| Malformed)?;
                    Value::Bytes(take(&mut data, len)?)
                }
                5 => Value::Fixed32(u32::from_le_bytes(
                    take(&mut data, 4)?.try_into().expect("four bytes"),
                )),
                _ => return Err(Malformed),
            };
            fields.push((field, value));
        }
        Ok(Self(fields))
    }

    fn last(&self, field: u32) -> Option<Value<'a>> {
        self.0
            .iter()
            .rev()
            .find(|(number, _)| *number == field)
            .map(|(_, value)| *value)
    }

    pub(crate) fn varint(&self, field: u32) -> Option<u64> {
        match self.last(field)? {
            Value::Varint(value) => Some(value),
            _ => None,
        }
    }

    #[cfg(test)]
    pub(crate) fn fixed64(&self, field: u32) -> Option<u64> {
        match self.last(field)? {
            Value::Fixed64(value) => Some(value),
            _ => None,
        }
    }

    pub(crate) fn bytes(&self, field: u32) -> Option<&'a [u8]> {
        match self.last(field)? {
            Value::Bytes(value) => Some(value),
            _ => None,
        }
    }

    /// An `int32`, which is sent sign-extended to 64 bits when negative.
    pub(crate) fn int32(&self, field: u32) -> Option<i32> {
        self.varint(field).map(|value| value as i64 as i32)
    }

    pub(crate) fn bool(&self, field: u32) -> Option<bool> {
        self.varint(field).map(|value| value != 0)
    }
}

fn take_varint(data: &mut &[u8]) -> Result<u64, Malformed> {
    let mut value = 0u64;
    for shift in (0..64).step_by(7) {
        let (&byte, rest) = data.split_first().ok_or(Malformed)?;
        *data = rest;
        value |= u64::from(byte & 0x7F) << shift;
        if byte & 0x80 == 0 {
            return Ok(value);
        }
    }
    Err(Malformed)
}

fn take<'a>(data: &mut &'a [u8], len: usize) -> Result<&'a [u8], Malformed> {
    if data.len() < len {
        return Err(Malformed);
    }
    let (taken, rest) = data.split_at(len);
    *data = rest;
    Ok(taken)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn what_is_written_reads_back() {
        let nested = Writer::default().fixed32(1, 7).finish();
        let message = Writer::default()
            .varint(1, 65580)
            .fixed64(2, 76561197960287930)
            .string(108, "token")
            .bytes(11, &nested)
            .varint(2, (-5i64) as u64)
            .finish();
        let fields = Fields::read(&message).unwrap();
        assert_eq!(fields.varint(1), Some(65580));
        assert_eq!(fields.bytes(108), Some(&b"token"[..]));
        assert_eq!(fields.int32(2), Some(-5));
        assert_eq!(fields.fixed64(2), None);
        assert_eq!(
            Fields::read(fields.bytes(11).unwrap()).unwrap().last(1),
            Some(Value::Fixed32(7))
        );
    }

    #[test]
    fn known_bytes_are_read() {
        // Field 1 = 150, the example from the protobuf docs; field 108 is a two-byte key.
        assert_eq!(
            Writer::default().varint(1, 150).finish(),
            [0x08, 0x96, 0x01]
        );
        assert_eq!(
            Writer::default().string(108, "a").finish(),
            [0xE2, 0x06, 0x01, b'a']
        );
    }

    #[test]
    fn cut_off_messages_are_an_error() {
        assert!(Fields::read(&[0x08]).is_err());
        assert!(Fields::read(&[0x12, 0x05, 1, 2]).is_err());
        assert!(Fields::read(&[0x0B]).is_err());
    }
}
