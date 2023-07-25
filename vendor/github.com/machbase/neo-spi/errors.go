package spi

import "errors"

var ErrUserCancel error = errors.New("user cancel")
var ErrNotImplemented = errors.New("not implemented")
